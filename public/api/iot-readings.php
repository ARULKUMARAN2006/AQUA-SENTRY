<?php
declare(strict_types=1);

$source = 'https://iotwebserver.in/table.php?id=sedj7xyj';
$body = false;
$status = 0;
$error = 'Unable to initialize the IoT source request';

for ($attempt = 0; $attempt < 3 && $body === false; $attempt++) {
    $curl = curl_init($source);
    if ($curl === false) {
        break;
    }

    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_USERAGENT => 'AERIAS IoT dashboard',
    ]);

    $body = curl_exec($curl);
    $status = curl_getinfo($curl, CURLINFO_HTTP_CODE);
    $error = curl_error($curl);
    curl_close($curl);

    if ($body === false && $attempt < 2) {
        usleep(500000);
    }
}

if ($body === false || $status < 200 || $status >= 300) {
    http_response_code(502);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => $error ?: "IoT source returned HTTP {$status}"]);
    exit;
}

function closestSourceTimestamp(string $text): int
{
    $parsed = strtotime($text);
    if ($parsed === false) {
        return 0;
    }

    $now = time();
    $candidates = [$parsed - 12 * 60 * 60, $parsed, $parsed + 12 * 60 * 60];
    usort($candidates, static fn (int $a, int $b): int =>
        abs($a - $now) <=> abs($b - $now)
    );
    return $candidates[0] * 1000;
}

function syncReadings(string $html): void
{
    $document = new DOMDocument();
    @$document->loadHTML($html);
    $xpath = new DOMXPath($document);
    $database = new mysqli(
        getenv('AQUA_DB_HOST') ?: '127.0.0.1',
        getenv('AQUA_DB_USER') ?: 'root',
        getenv('AQUA_DB_PASSWORD') ?: '',
        getenv('AQUA_DB_NAME') ?: 'aquasentry'
    );
    if ($database->connect_errno) {
        error_log('AERIAS IoT database connection failed: ' . $database->connect_error);
        return;
    }

    $find = $database->prepare(
        'SELECT id FROM sensor_readings WHERE ts = ? AND sensor = ? AND value = ? LIMIT 1'
    );
    $insert = $database->prepare(
        'INSERT IGNORE INTO sensor_readings (ts, sensor, value, unit, stage, mode) VALUES (?, ?, ?, ?, "intake", "normal")'
    );

    foreach ($xpath->query('//table//tr') as $row) {
        $cells = [];
        foreach ($xpath->query('./th|./td', $row) as $cell) {
            $cells[] = trim($cell->textContent);
        }
        if (count($cells) < 4 || !ctype_digit($cells[0])) {
            continue;
        }

        $turbidity = filter_var($cells[1], FILTER_VALIDATE_FLOAT);
        $temperature = filter_var($cells[2], FILTER_VALIDATE_FLOAT);
        $timestamp = closestSourceTimestamp($cells[3]);
        if ($turbidity === false || $temperature === false || $timestamp === 0) {
            continue;
        }

        foreach ([
            ['turbidity', (float) $turbidity, 'NTU'],
            ['temperature', (float) $temperature, '°C'],
        ] as [$sensor, $value, $unit]) {
            $find->bind_param('isd', $timestamp, $sensor, $value);
            $find->execute();
            if ($find->get_result()->num_rows > 0) {
                continue;
            }
            $insert->bind_param('isds', $timestamp, $sensor, $value, $unit);
            $insert->execute();
        }
    }

    $find->close();
    $insert->close();
    $database->close();
}

syncReadings($body);
header('Content-Type: text/html; charset=utf-8');
echo $body;
