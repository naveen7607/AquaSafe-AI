#include "WiFiManager.h"
#include "Config.h"
#include <Arduino.h>

#if ENABLE_WIFI
#include <WiFi.h>
#endif

static unsigned long lastReconnectAttempt = 0;

void WiFiManager::begin() {
#if ENABLE_WIFI
    Serial.println("\n[WiFi] Initializing Wi-Fi...");
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    
    // Non-blocking start. We will verify connection in status updates.
    Serial.print("[WiFi] Connecting to SSID: ");
    Serial.println(WIFI_SSID);
#else
    Serial.println("[WiFi] Wi-Fi features disabled in Config.h");
#endif
}

bool WiFiManager::isConnected() {
#if ENABLE_WIFI
    return (WiFi.status() == WL_CONNECTED);
#else
    return false;
#endif
}

void WiFiManager::keepAlive() {
#if ENABLE_WIFI
    if (WiFi.status() != WL_CONNECTED) {
        unsigned long now = millis();
        // Attempt reconnection every 15 seconds without blocking execution
        if (now - lastReconnectAttempt > 15000) {
            Serial.println("[WiFi] Wi-Fi lost. Attempting reconnection...");
            WiFi.disconnect();
            WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
            lastReconnectAttempt = now;
        }
    }
#endif
}
