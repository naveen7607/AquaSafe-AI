#include "ThingSpeakManager.h"
#include "Config.h"
#include "WiFiManager.h"
#include <Arduino.h>

#if ENABLE_WIFI
#include <WiFi.h>
#include <HTTPClient.h>
#endif

void ThingSpeakManager::begin() {
    Serial.println("[ThingSpeak] Manager initialized.");
}

bool ThingSpeakManager::upload(const SensorData &data) {
#if ENABLE_WIFI && ENABLE_THINGSPEAK
    if (!WiFiManager::isConnected()) {
        Serial.println("[ThingSpeak] Upload skipped: Wi-Fi not connected.");
        return false;
    }

    // Guard against placeholder API keys
    if (strcmp(THINGSPEAK_API_WRITE_KEY, "YOUR_THINGSPEAK_WRITE_KEY") == 0) {
        Serial.println("[ThingSpeak] Upload skipped: Please configure your API Write Key in Config.h");
        return false;
    }

    HTTPClient http;
    
    // Construct the REST API request URL
    // field1: pH, field2: TDS, field3: Temp, field4: Turbidity
    // field5: Water Score, field6: Overall Status, field7: Sensors Health bitmask
    int healthBitmask = (data.phWorking ? 1 : 0) | 
                       ((data.tdsWorking ? 1 : 0) << 1) | 
                       ((data.tempWorking ? 1 : 0) << 2) | 
                       ((data.turbidityWorking ? 1 : 0) << 3);

    String url = "http://api.thingspeak.com/update?api_key=";
    url += THINGSPEAK_API_WRITE_KEY;
    url += "&field1=" + String(data.pH, 2);
    url += "&field2=" + String(data.tds);
    url += "&field3=" + String(data.temperature, 1);
    url += "&field4=" + String(data.turbidity);
    url += "&field5=" + String(data.waterScore);
    url += "&field6=" + String((int)data.overallStatus);
    url += "&field7=" + String(healthBitmask);

    Serial.print("[ThingSpeak] Uploading telemetry... ");
    
    http.begin(url);
    int httpResponseCode = http.GET();
    bool success = false;
    
    if (httpResponseCode > 0) {
        String response = http.getString();
        // ThingSpeak returns the entry ID (e.g. "125") if successful, or "0" if throttled
        if (response.toInt() > 0) {
            Serial.println("Success! Entry ID: " + response);
            success = true;
        } else {
            Serial.println("Failed: Throttled (under 15s interval) or bad key.");
        }
    } else {
        Serial.print("Failed. Error code: ");
        Serial.println(httpResponseCode);
    }
    
    http.end();
    return success;
#else
    return false;
#endif
}
