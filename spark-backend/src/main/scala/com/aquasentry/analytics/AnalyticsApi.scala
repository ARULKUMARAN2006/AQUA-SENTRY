package com.aquasentry.analytics

import com.sun.net.httpserver.{HttpExchange, HttpHandler, HttpServer}
import org.json4s.JsonDSL._
import org.json4s.{JArray, JDouble, JInt, JNull, JObject, JString, JValue}
import org.json4s.jackson.JsonMethods.{parse => jparse}

import java.net.InetSocketAddress
import java.net.URI
import java.nio.charset.StandardCharsets
import java.nio.file.{Files, Paths}
import java.time.Instant
import java.sql.DriverManager

/**
 * AnalyticsApi — the backend for the React dashboard.
 *
 * Endpoints
 *   GET  /api/health      backend + Spark status
 *   POST /api/ingest      append simulated sensor readings to the data source
 *   GET  /api/analytics   the aggregated result produced by the Spark job
 *
 * Spark runs as a batch job; this server only exposes what the job wrote. When
 * the summary is missing or stale it says so explicitly rather than inventing
 * results.
 */
object AnalyticsApi {

  private val dataDir    = Paths.get("data")
  private val resultFile = dataDir.resolve("analytics_summary.json")
  private val dbUrl = sys.env.getOrElse(
    "AQUA_DB_URL",
    "jdbc:mysql://localhost:3306/aquasentry?useSSL=false&serverTimezone=UTC",
  )
  private val dbUser = sys.env.getOrElse("AQUA_DB_USER", "root")
  private val dbPassword = sys.env.getOrElse("AQUA_DB_PASSWORD", "")

  private val maxAgeMs = 24 * 60 * 60 * 1000L // 24h

  def main(args: Array[String]): Unit = {
    val port = args.lift(0).map(_.toInt).getOrElse(8080)
    Files.createDirectories(dataDir)

    val server = HttpServer.create(new InetSocketAddress(port), 0)
    server.createContext("/api/health", handler(statusHandler))
    server.createContext("/api/iot-readings", handler(iotReadingsHandler))
    server.createContext("/api/ingest", handler(ingestHandler))
    server.createContext("/api/analytics", handler(analyticsHandler))
    server.setExecutor(java.util.concurrent.Executors.newFixedThreadPool(4))
    server.start()

    println(s"[api] Aqua Sentry analytics backend on http://localhost:$port")
    println(s"[api] data dir: ${dataDir.toAbsolutePath}")
  }

  // ── handlers ────────────────────────────────────────────────────────────────

  private def statusHandler(ex: HttpExchange): Unit = respond(200, ex,
    ("service" -> "aqua-sentry-analytics") ~
      ("time" -> Model.jLong(System.currentTimeMillis())) ~
      ("spark" -> sparkStatusJson())
  )

  /** Proxies the IoT table because the upstream site does not allow browser CORS requests. */
  private def iotReadingsHandler(ex: HttpExchange): Unit = {
    val connection = URI
      .create("https://iotwebserver.in/table.php?id=sedj7xyj")
      .toURL
      .openConnection()
      .asInstanceOf[java.net.HttpURLConnection]
    connection.setRequestMethod("GET")
    connection.setConnectTimeout(5000)
    connection.setReadTimeout(10000)
    try {
      val code = connection.getResponseCode
      if (code < 200 || code >= 300) {
        respond(502, ex, ("error" -> s"IoT source returned HTTP $code"))
      } else {
        respondText(200, ex, new String(connection.getInputStream.readAllBytes(), StandardCharsets.UTF_8))
      }
    } finally connection.disconnect()
  }

  /**
   * Accepts { "readings": [ { ts, sensor, value, unit, stage, mode } ] } and
   * appends them to the JSONL data source the Spark job reads.
   */
  private def ingestHandler(ex: HttpExchange): Unit = {
    try {
      val raw = new String(ex.getRequestBody.readAllBytes(), StandardCharsets.UTF_8)
      val parsed = jparse(if (raw.trim.isEmpty) "[]" else raw)
      val arr: List[JValue] = (parsed \ "readings") match {
        case JArray(list) => list
        case _            => Nil
      }

      if (arr.isEmpty) {
        respond(400, ex,
          ("error" -> "No readings supplied") ~
            ("expected" -> "{ \"readings\": [ { ts, sensor, value, unit, stage, mode } ] }")
        )
        return
      }

      val connection = DriverManager.getConnection(dbUrl, dbUser, dbPassword)
      val statement = connection.prepareStatement(
        "INSERT INTO sensor_readings (ts, sensor, value, unit, stage, mode) VALUES (?, ?, ?, ?, ?, ?)",
      )
      var written = 0
      try {
        arr.foreach {
          case JObject(fields) =>
            val get = (k: String) => fields.collectFirst { case (n, v) if n == k => v }
            def str(k: String, d: String): String = get(k) match {
              case Some(JString(s)) => s
              case _                => d
            }
            def dbl(k: String): Option[Double] = get(k) match {
              case Some(JDouble(v)) => Some(v)
              case Some(JInt(v))    => Some(v.toDouble)
              case _                => None
            }
            def lng(k: String, d: Long): Long = get(k) match {
              case Some(JInt(v))    => v.toLong
              case Some(JDouble(v)) => v.toLong
              case _                => d
            }

            val sensor = str("sensor", "")
            dbl("value") match {
              case Some(v) if sensor.nonEmpty =>
                statement.setLong(1, lng("ts", Instant.now().toEpochMilli))
                statement.setString(2, sensor)
                statement.setDouble(3, v)
                statement.setString(4, str("unit", ""))
                statement.setString(5, str("stage", "intake"))
                statement.setString(6, str("mode", "normal"))
                statement.addBatch()
                written += 1
              case _ => ()
            }
          case _ => ()
        }
        statement.executeBatch()
      } finally {
        statement.close()
        connection.close()
      }

      respond(200, ex,
        ("accepted" -> Model.jLong(written.toLong)) ~
          ("database" -> "aquasentry") ~
          ("table" -> "sensor_readings") ~
          ("spark" -> sparkStatusJson())
      )
    } catch {
      case e: Throwable =>
        respond(400, ex, ("error" -> Option(e.getMessage).getOrElse(e.toString)))
    }
  }

  private def analyticsHandler(ex: HttpExchange): Unit = {
    if (!Files.exists(resultFile)) {
      respond(200, ex,
        ("available" -> false) ~
          ("source" -> "spark") ~
          ("spark" -> sparkStatusJson()) ~
          ("message" -> "No Spark analytics available yet. Ingest readings, then run the Spark job.") ~
          ("sensors" -> JArray(Nil))
      )
      return
    }

    try {
      val parsed = jparse(Files.readString(resultFile))
      respond(200, ex,
        ("available" -> true) ~
          ("source" -> "spark") ~
          ("spark" -> sparkStatusJson()) ~
          ("analytics" -> parsed)
      )
    } catch {
      case e: Throwable =>
        respond(500, ex, ("error" -> Option(e.getMessage).getOrElse(e.toString)))
    }
  }

  /** Reflects only what is genuinely on disk. */
  private def sparkStatusJson(): JObject = {
    if (!Files.exists(resultFile)) {
      ("state" -> "MISSING") ~
        ("ready" -> false) ~
        ("message" -> "Spark analytics have not been generated. Run: sbt \"runMain com.aquasentry.analytics.AquaSentryAnalytics\"") ~
        ("generatedAt" -> JNull)
    } else {
      val age = System.currentTimeMillis() - Files.getLastModifiedTime(resultFile).toMillis
      val fresh = age <= maxAgeMs
      val generated =
        try Model.optLongField(jparse(Files.readString(resultFile)), "generatedAt")
        catch { case _: Throwable => None }

      val (state, msg) =
        if (fresh) ("READY", "Spark analytics are up to date.")
        else ("STALE", "Spark analytics are older than 24h. Re-run the Spark job to refresh.")

      ("state" -> state) ~
        ("ready" -> fresh) ~
        ("message" -> msg) ~
        ("ageMinutes" -> Model.jLong(age / 60000L)) ~
        ("generatedAt" -> (generated.map(Model.jLong) getOrElse JNull))
    }
  }

  // ── HTTP helpers ────────────────────────────────────────────────────────────

  private def handler(f: HttpExchange => Unit): HttpHandler = new HttpHandler {
    override def handle(ex: HttpExchange): Unit = {
      try {
        val h = ex.getResponseHeaders
        h.add("Access-Control-Allow-Origin", "*")
        h.add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        h.add("Access-Control-Allow-Headers", "Content-Type")

        if (ex.getRequestMethod == "OPTIONS") {
          ex.sendResponseHeaders(204, -1)
        } else {
          f(ex)
        }
      } catch {
        case e: Throwable =>
          try respond(500, ex, ("error" -> Option(e.getMessage).getOrElse(e.toString)))
          catch { case _: Throwable => () }
      } finally ex.close()
    }
  }

  private def respond(code: Int, ex: HttpExchange, j: JValue): Unit = {
    val bytes = Model.renderJson(j).getBytes(StandardCharsets.UTF_8)
    ex.getResponseHeaders.add("Content-Type", "application/json; charset=utf-8")
    ex.sendResponseHeaders(code, bytes.length.toLong)
    val os = ex.getResponseBody
    try os.write(bytes) finally os.close()
  }

  private def respondText(code: Int, ex: HttpExchange, body: String): Unit = {
    val bytes = body.getBytes(StandardCharsets.UTF_8)
    ex.getResponseHeaders.add("Content-Type", "text/html; charset=utf-8")
    ex.sendResponseHeaders(code, bytes.length.toLong)
    val os = ex.getResponseBody
    try os.write(bytes) finally os.close()
  }
}
