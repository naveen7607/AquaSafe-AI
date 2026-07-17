#ifndef SENSORS_H
#define SENSORS_H

#include "Types.h"
#include <OneWire.h>
#include <DallasTemperature.h>

class Sensors {
public:
    Sensors();
    void begin();
    void readAll(SensorData &data);

private:
    OneWire oneWire;
    DallasTemperature tempSensor;

    // Individual sensor read routines returning raw voltage or calibrated parameter
    float readPHValue(float &rawVoltage);
    int readTDSValue(float temperature, float &rawVoltage);
    float readTemperatureValue();
    int readTurbidityValue(float &rawVoltage);
    
    // Diagnostic health check functions
    bool checkPHHealth(float voltage);
    bool checkTDSHealth(float voltage);
    bool checkTempHealth(float tempC);
    bool checkTurbidityHealth(float voltage);
};

#endif // SENSORS_H
