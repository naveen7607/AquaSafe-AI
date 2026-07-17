#include "DataManager.h"
#include "Config.h"
#include "WaterQuality.h"
#include "WiFiManager.h"
#include "ThingSpeakManager.h"
#include "FirebaseManager.h"

DataManager::DataManager() 
    : lastSensorReadTime(0), lastCloudUploadTime(0) {
    // Initialize structures
    currentData.pH = 7.0;
    currentData.tds = 0;
    currentData.temperature = 25.0;
    currentData.turbidity = 0;
    currentData.phWorking = false;
    currentData.tdsWorking = false;
    currentData.tempWorking = false;
    currentData.turbidityWorking = false;
    currentData.waterScore = 0;
    currentData.overallStatus = STATUS_ERROR;
    currentData.reason = "Initializing...";
    currentData.waterStatus = STATUS_SAFE;
    currentData.waterReason = "Initializing...";
}

void DataManager::begin() {
    Serial.begin(115200);
    Serial.println("\n--- AquaSafe AI System Booting ---");
    
    // Initialize hardware peripherals
    sensors.begin();
    display.begin();
    alarm.begin();
    
    // Initialize networks and cloud protocols
    WiFiManager::begin();
    ThingSpeakManager::begin();
    FirebaseManager::begin();
    
    // Initial read to populate data immediately
    sensors.readAll(currentData);
    WaterQuality::evaluate(currentData);
    
    lastSensorReadTime = millis();
    lastCloudUploadTime = millis();
}

void DataManager::update() {
    unsigned long now = millis();
    
    // 1. Maintain Network Connection Health
    WiFiManager::keepAlive();
    
    // 2. Read Sensors and Analyze Quality at regular intervals
    if (now - lastSensorReadTime >= SENSOR_READ_INTERVAL) {
        sensors.readAll(currentData);
        WaterQuality::evaluate(currentData);
        
        // Output diagnostics to Serial Monitor
        Serial.println("---");
        Serial.print("[Quality]  Score   = " + String(currentData.waterScore) + "/100        | Status = ");
        switch (currentData.overallStatus) {
            case STATUS_SAFE: Serial.println("SAFE"); break;
            case STATUS_WARNING: Serial.println("WARNING (" + currentData.reason + ")"); break;
            case STATUS_DANGER: Serial.println("DANGER (" + currentData.reason + ")"); break;
            case STATUS_ERROR: Serial.println("FAULT (" + currentData.reason + ")"); break;
        }
        Serial.println("--------------------------------------------------");
        
        lastSensorReadTime = now;
    }
    
    // 3. Process Cloud uploads at larger intervals
    if (now - lastCloudUploadTime >= CLOUD_UPLOAD_INTERVAL) {
        ThingSpeakManager::upload(currentData);
        FirebaseManager::sync(currentData);
        lastCloudUploadTime = now;
    }
    
    // 4. Continuously run non-blocking UI and alarms (using their internal millisecond triggers)
    display.update(currentData);
    alarm.update(currentData.overallStatus);
}
