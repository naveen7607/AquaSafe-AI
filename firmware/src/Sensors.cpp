#include "Sensors.h"
#include "Config.h"
#include "Calibration.h"
#include "Utilities.h"

Sensors::Sensors() 
    : oneWire(TEMP_PIN), tempSensor(&oneWire) {
}

void Sensors::begin() {
    // Initialize DS18B20 temperature sensor
    tempSensor.begin();
    
    // Configure analog inputs as standard INPUT (no pull-down/pull-up)
    // enabling internal pull-ups or pull-downs on high-impedance sensor boards
    // will distort analog voltages and yield highly inaccurate readings.
    pinMode(PH_PIN, INPUT);
    pinMode(TDS_PIN, INPUT);
    pinMode(TURBIDITY_PIN, INPUT);
    
    // Configure ADC attenuation to 11dB to allow reading the full 0-3.3V range on ESP32
    analogSetPinAttenuation(PH_PIN, ADC_11db);
    analogSetPinAttenuation(TDS_PIN, ADC_11db);
    analogSetPinAttenuation(TURBIDITY_PIN, ADC_11db);
}

void Sensors::readAll(SensorData &data) {
    float rawPHVolt = 0.0;
    float rawTDSVolt = 0.0;
    float rawTurbidityVolt = 0.0;

    // 1. Read Temperature first as it's needed for TDS temperature compensation
    data.temperature = readTemperatureValue();
    data.tempWorking = checkTempHealth(data.temperature);
    if (!data.tempWorking) {
        // Fallback to a nominal 25.0 C for calculations if sensor fails
        data.temperature = 25.0; 
    }

    // 2. Read pH
    data.pH = readPHValue(rawPHVolt);
    data.phWorking = checkPHHealth(rawPHVolt);

    // 3. Read TDS
    data.tds = readTDSValue(data.temperature, rawTDSVolt);
    data.tdsWorking = checkTDSHealth(rawTDSVolt);

    // 4. Read Turbidity
    data.turbidity = readTurbidityValue(rawTurbidityVolt);
    data.turbidityWorking = checkTurbidityHealth(rawTurbidityVolt);

    // Reconstruct raw ADC values for logging
    int phADC = (int)round((rawPHVolt / ADC_REF_VOLTAGE) * ADC_RESOLUTION);
    int tdsADC = (int)round((rawTDSVolt / ADC_REF_VOLTAGE) * ADC_RESOLUTION);
    int turbADC = (int)round((rawTurbidityVolt / ADC_REF_VOLTAGE) * ADC_RESOLUTION);

    // Print detailed hardware diagnostics to Serial Monitor
    Serial.println("\n===== [HARDWARE DIAGNOSTICS] =====");
    Serial.printf("pH:        Raw ADC = %4d | Voltage = %5.3f V | pH Value = %5.2f | Status = %s\n", 
                  phADC, rawPHVolt, data.pH, data.phWorking ? "WORKING" : "FAULT (NW)");
    Serial.printf("TDS:       Raw ADC = %4d | Voltage = %5.3f V | TDS Value = %3d ppm | Status = %s\n", 
                  tdsADC, rawTDSVolt, data.tds, data.tdsWorking ? "WORKING" : "FAULT (NW)");
    Serial.printf("Turbidity: Raw ADC = %4d | Voltage = %5.3f V | Turb Pct  = %3d %%   | Status = %s\n", 
                  turbADC, rawTurbidityVolt, data.turbidity, data.turbidityWorking ? "WORKING" : "FAULT (NW)");
    Serial.printf("Temp:      Value   = %5.2f C  | Status = %s\n", 
                  data.temperature, data.tempWorking ? "WORKING" : "FAULT (NW)");
    Serial.println("==================================");
}

float Sensors::readPHValue(float &rawVoltage) {
    int rawADC = Utilities::averageAnalogRead(PH_PIN);
    rawVoltage = (rawADC / ADC_RESOLUTION) * ADC_REF_VOLTAGE;
    
    // Linear pH translation formula: pH = 7.0 + ((V_pH7 - V_actual) / Slope)
    float phValue = 7.0 + ((PH_VOLTAGE_AT_7 - rawVoltage) / PH_SLOPE);
    return Utilities::constrainFloat(phValue, 0.0, 14.0);
}

int Sensors::readTDSValue(float temperature, float &rawVoltage) {
    int rawADC = Utilities::averageAnalogRead(TDS_PIN);
    rawVoltage = (rawADC / ADC_RESOLUTION) * ADC_REF_VOLTAGE;
    
    // Temperature compensation formula
    float compensationCoefficient = 1.0 + TEMP_COMP_COEFF * (temperature - 25.0);
    float compensatedVoltage = rawVoltage / compensationCoefficient;
    
    // TDS conversion formula based on Gravity TDS equation
    float tdsValue = (133.3 * compensatedVoltage * compensatedVoltage * compensatedVoltage 
                     - 255.86 * compensatedVoltage * compensatedVoltage 
                     + 857.39 * compensatedVoltage) * TDS_CALIBRATION_FACTOR;
                     
    return (int)Utilities::constrainFloat(tdsValue, 0.0, 1000.0);
}

float Sensors::readTemperatureValue() {
    tempSensor.requestTemperatures();
    float tempC = tempSensor.getTempCByIndex(0);
    
    if (tempC == DEVICE_DISCONNECTED_C) {
        return DEVICE_DISCONNECTED_C;
    }
    
    return tempC + TEMP_CAL_OFFSET;
}

int Sensors::readTurbidityValue(float &rawVoltage) {
    int rawADC = Utilities::averageAnalogRead(TURBIDITY_PIN);
    rawVoltage = (rawADC / ADC_RESOLUTION) * ADC_REF_VOLTAGE;
    Serial.printf("[TURB DEBUG] Raw ADC = %d | Voltage = %.3f V\n", rawADC, rawVoltage);
    
    float turbidityPct = 0.0;
    
    // Map turbidity voltage from clean water limit (0%) to dirty water limit (100%)
    if (rawVoltage >= TURBIDITY_VOLT_CLEAN) {
        turbidityPct = 0.0;
    } else if (rawVoltage <= TURBIDITY_VOLT_DIRTY) {
        turbidityPct = 100.0;
    } else {
        // Linear mapping: higher voltage = cleaner water (0%), lower voltage = dirtier water (100%)
        // in_min must be < in_max, so map from DIRTY(low) to CLEAN(high) and invert output
        turbidityPct = Utilities::mapFloat(rawVoltage, TURBIDITY_VOLT_DIRTY, TURBIDITY_VOLT_CLEAN, 100.0, 0.0);
    }
    
    return (int)round(Utilities::constrainFloat(turbidityPct, 0.0, 100.0));
}

// --- Health Check Implementations ---

bool Sensors::checkPHHealth(float voltage) {
    // If the voltage is at the limits (short to GND or VCC), it is disconnected/broken
    if (voltage < 0.05 || voltage > 3.25) {
        return false;
    }
    return true;
}

bool Sensors::checkTDSHealth(float voltage) {
    // A working TDS sensor will produce a continuous 0 value (0V) in pure/distilled water or air.
    // Thus we do not treat low voltage as a hardware fault, only high voltage (>3.25V) which indicates a short.
    if (voltage > 3.25) {
        return false;
    }
    return true;
}

bool Sensors::checkTempHealth(float tempC) {
    // OneWire returns DEVICE_DISCONNECTED_C if not connected
    if (tempC == DEVICE_DISCONNECTED_C) {
        return false;
    }
    return true;
}

bool Sensors::checkTurbidityHealth(float voltage) {
    // A completely disconnected or unpowered sensor will read 0V.
    // We only flag a fault if voltage drops below 0.2V to prevent false positives in extremely muddy water.
    if (voltage < 0.2) {
        return false;
    }
    return true;
}
