#ifndef TYPES_H
#define TYPES_H

#include <Arduino.h>

enum Status {
    STATUS_SAFE = 0,
    STATUS_WARNING = 1,
    STATUS_DANGER = 2,
    STATUS_ERROR = 3
};

struct SensorData {
    float pH;
    int tds;
    float temperature;
    int turbidity; // In percentage (0-100%)
    
    // Sensor health indicators
    bool phWorking;
    bool tdsWorking;
    bool tempWorking;
    bool turbidityWorking;
    
    // Water quality summary
    int waterScore; // 0 to 100
    Status overallStatus;
    String reason;
    
    // Separate water safety status and reason for display
    Status waterStatus;
    String waterReason;
};

#endif // TYPES_H
