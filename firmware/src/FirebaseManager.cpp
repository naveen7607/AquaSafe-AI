#include "FirebaseManager.h"
#include "Config.h"
#include "WiFiManager.h"
#include <Arduino.h>

#if ENABLE_WIFI
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#endif

void FirebaseManager::begin() {
    Serial.println("[Firebase] Manager initialized.");
}

bool FirebaseManager::sync(const SensorData &data) {
#if ENABLE_WIFI && ENABLE_FIREBASE
    if (!WiFiManager::isConnected()) {
        Serial.println("[Firebase] Sync skipped: Wi-Fi not connected.");
        return false;
    }

    // Guard against default placeholder database host names
    if (strcmp(FIREBASE_HOST, "your-project-id-default-rtdb.firebaseio.com") == 0) {
        Serial.println("[Firebase] Sync skipped: Please configure your Firebase Host in Config.h");
        return false;
    }

    WiFiClientSecure client;
    client.setInsecure(); // Disable SSL validation for simplicity/avoiding finger-print changes
    
    HTTPClient http;
    
    // Construct database URL
    String url = "https://" + String(FIREBASE_HOST) + "/aquasafe.json";
    if (strlen(FIREBASE_AUTH) > 0 && strcmp(FIREBASE_AUTH, "YOUR_FIREBASE_DATABASE_SECRET") != 0) {
        url += "?auth=" + String(FIREBASE_AUTH);
    }
    
    // Manually format a flat JSON payload to avoid ArduinoJson dependency versions issues
    String payload = "{";
    payload += "\"pH\":" + String(data.pH, 2) + ",";
    payload += "\"tds\":" + String(data.tds) + ",";
    payload += "\"temperature\":" + String(data.temperature, 1) + ",";
    payload += "\"turbidity\":" + String(data.turbidity) + ",";
    payload += "\"phWorking\":" + String(data.phWorking ? "true" : "false") + ",";
    payload += "\"tdsWorking\":" + String(data.tdsWorking ? "true" : "false") + ",";
    payload += "\"tempWorking\":" + String(data.tempWorking ? "true" : "false") + ",";
    payload += "\"turbidityWorking\":" + String(data.turbidityWorking ? "true" : "false") + ",";
    payload += "\"waterScore\":" + String(data.waterScore) + ",";
    payload += "\"overallStatus\":" + String((int)data.overallStatus) + ",";
    payload += "\"reason\":\"" + data.reason + "\",";
    payload += "\"timestamp\":{\".sv\":\"timestamp\"}"; // Auto-syncs to database timestamp
    payload += "}";

    Serial.print("[Firebase] Patching telemetry data... ");
    
    http.begin(client, url);
    http.addHeader("Content-Type", "application/json");
    
    // Use PATCH to merge/overwrite fields in Realtime Database
    int httpResponseCode = http.PATCH(payload);
    bool success = false;
    
    if (httpResponseCode == HTTP_CODE_OK) {
        Serial.println("Success!");
        success = true;
    } else {
        Serial.print("Failed. HTTPS Code: ");
        Serial.println(httpResponseCode);
        if (httpResponseCode > 0) {
            String response = http.getString();
            Serial.println("Response: " + response);
        }
    }
    
    http.end();
    return success;
#else
    return false;
#endif
}
