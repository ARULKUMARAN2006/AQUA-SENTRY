package com.aquasentry.analytics

import org.json4s.{JDouble, JInt, JNull, JObject, JString, JValue}
import org.json4s.JsonDSL._
import org.json4s.jackson.JsonMethods.{compact, render => jrender}

/**
 * Result model + JSON rendering.
 *
 * Everything the dashboard's Analytics page consumes is produced here by the
 * Spark job. The field names are the API contract.
 */
object Model {

  val SensorOrder = Seq("ph", "turbidity", "temperature", "tds", "do", "optical")

  def sensorLabel(sensor: String): String = sensor match {
    case "ph"          => "pH"
    case "turbidity"   => "Turbidity"
    case "temperature" => "Temperature"
    case "tds"         => "TDS"
    case "do"          => "Dissolved Oxygen"
    case "optical"     => "Optical Underwater"
    case other         => other
  }

  def unit(sensor: String): String = sensor match {
    case "turbidity"   => "NTU"
    case "temperature" => "°C"
    case "tds"         => "ppm"
    case "do"          => "mg/L"
    case "optical"     => "%"
    case _             => ""
  }

  def digits(sensor: String): Int = sensor match {
    case "tds" | "optical" => 0
    case "ph"              => 2
    case _                 => 1
  }

  /** Alert severity -> status vocabulary shared with the React UI. */
  def statusFor(sensor: String, value: Double): String = {
    if (value.isNaN || value.isInfinite) return "UNKNOWN"
    val g = goodRange(sensor)
    if (g == null) "UNKNOWN"
    else if (value >= g._1 && value <= g._2) "NORMAL"
    else if (moderateRange(sensor).exists { case (lo, hi) => value >= lo && value <= hi }) "WARNING"
    else "CRITICAL"
  }

  /** Configured good bands, mirrored from the dashboard thresholds. */
  private def goodRange(sensor: String): (Double, Double) = sensor match {
    case "ph"          => (6.5, 8.5)
    case "turbidity"   => (0.0, 5.0)
    case "temperature" => (20.0, 30.0)
    case "tds"         => (0.0, 300.0)
    case "do"          => (5.0, 11.5)
    case "optical"     => (70.0, 100.0)
    case _             => null
  }

  private def moderateRange(sensor: String): Option[(Double, Double)] = sensor match {
    case "ph"          => Some((6.0, 9.0))
    case "turbidity"   => Some((0.0, 10.0))
    case "temperature" => Some((15.0, 35.0))
    case "tds"         => Some((0.0, 500.0))
    case "do"          => Some((4.0, 13.0))
    case "optical"     => Some((45.0, 100.0))
    case _             => None
  }

  def round(v: Double, places: Int): Double = {
    val f = math.pow(10, places.toDouble)
    math.round(v * f) / f
  }

  // ── JSON helpers (explicit, so no implicit Formats is needed) ────────────────

  def jDouble(v: Double, places: Int): JValue = JDouble(round(v, places))
  def jLong(v: Long): JValue = JInt(BigInt(v))

  def strField(j: JValue, name: String): String = (j \ name) match {
    case JString(s) => s
    case _          => ""
  }

  def optLongField(j: JValue, name: String): Option[Long] = (j \ name) match {
    case JInt(v)    => Some(v.toLong)
    case JDouble(v) => Some(v.toLong)
    case _          => None
  }

  def renderJson(j: JValue): String = compact(jrender(j))
}
