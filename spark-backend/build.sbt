name := "aqua-sentry-analytics"
organization := "com.aquasentry"
version := "1.0.0"

scalaVersion := "2.13.16"

// Apache Spark 4.x (Java 17/21 compatible) is used strictly for batch /
// historical analysis of sensor readings. Spark's default master is local[*],
// so no sbt-spark plugin is required.
libraryDependencies ++= Seq(
  "org.apache.spark" %% "spark-sql"     % "4.0.4",
  "org.json4s"       %% "json4s-jackson" % "4.0.7",
  "com.mysql"         % "mysql-connector-j" % "8.4.0",
  "org.scalatest"    %% "scalatest"     % "3.2.19" % Test,
)

Compile / run / fork := true
Compile / run / baseDirectory := file(".").getAbsoluteFile
Compile / run / javaOptions ++= Seq("-Xmx2g")

Test / fork := false
