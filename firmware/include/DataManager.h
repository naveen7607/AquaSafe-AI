#ifndef DATA_MANAGER_H
#define DATA_MANAGER_H

#include "Types.h"
#include "Sensors.h"
#include "Display.h"
#include "Alarm.h"

class DataManager {
public:
    DataManager();
    void begin();
    void update();

private:
    Sensors sensors;
    Display display;
    Alarm alarm;
    SensorData currentData;
    
    unsigned long lastSensorReadTime;
    unsigned long lastCloudUploadTime;
};

#endif // DATA_MANAGER_H
