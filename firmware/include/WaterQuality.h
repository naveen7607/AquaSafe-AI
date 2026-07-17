#ifndef WATER_QUALITY_H
#define WATER_QUALITY_H

#include "Types.h"

class WaterQuality {
public:
    // Main evaluation function to compute status, score, and descriptive warnings
    static void evaluate(SensorData &data);

private:
    // Helper evaluation methods for each parameter
    static float evaluatePH(float pH, bool working, String &reason, Status &paramStatus);
    static float evaluateTDS(int tds, bool working, float &compensationTemp, String &reason, Status &paramStatus);
    static float evaluateTemp(float temp, bool working, String &reason, Status &paramStatus);
    static float evaluateTurbidity(int turbidity, bool working, String &reason, Status &paramStatus);
};

#endif // WATER_QUALITY_H
