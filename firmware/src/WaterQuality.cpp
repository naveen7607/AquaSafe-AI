#include "WaterQuality.h"
#include "Calibration.h"
#include "Utilities.h"

void WaterQuality::evaluate(SensorData &data) {
    Status phStatus = STATUS_SAFE;
    Status tdsStatus = STATUS_SAFE;
    Status tempStatus = STATUS_SAFE;
    Status turbidityStatus = STATUS_SAFE;

    String phReason = "";
    String tdsReason = "";
    String tempReason = "";
    String turbidityReason = "";

    // 1. Evaluate individual parameter scores (0-100) and statuses
    float phScore = evaluatePH(data.pH, data.phWorking, phReason, phStatus);
    float tdsScore = evaluateTDS(data.tds, data.tdsWorking, data.temperature, tdsReason, tdsStatus);
    float tempScore = evaluateTemp(data.temperature, data.tempWorking, tempReason, tempStatus);
    float turbidityScore = evaluateTurbidity(data.turbidity, data.turbidityWorking, turbidityReason, turbidityStatus);

    // 2. Calculate the overall Water Quality Score (average of working sensors)
    int workingSensorsCount = 0;
    float totalScoreSum = 0.0;

    if (data.phWorking) { totalScoreSum += phScore; workingSensorsCount++; }
    if (data.tdsWorking) { totalScoreSum += tdsScore; workingSensorsCount++; }
    if (data.tempWorking) { totalScoreSum += tempScore; workingSensorsCount++; }
    if (data.turbidityWorking) { totalScoreSum += turbidityScore; workingSensorsCount++; }

    if (workingSensorsCount > 0) {
        data.waterScore = (int)(totalScoreSum / workingSensorsCount);
    } else {
        data.waterScore = 0;
    }

    // 3. Determine water safety status based on worst-performing working sensor
    Status computedWaterStatus = STATUS_SAFE;
    if (workingSensorsCount > 0) {
        if ((data.phWorking && phStatus == STATUS_DANGER) ||
            (data.tdsWorking && tdsStatus == STATUS_DANGER) ||
            (data.tempWorking && tempStatus == STATUS_DANGER) ||
            (data.turbidityWorking && turbidityStatus == STATUS_DANGER)) {
            computedWaterStatus = STATUS_DANGER;
        } else if ((data.phWorking && phStatus == STATUS_WARNING) ||
                   (data.tdsWorking && tdsStatus == STATUS_WARNING) ||
                   (data.tempWorking && tempStatus == STATUS_WARNING) ||
                   (data.turbidityWorking && turbidityStatus == STATUS_WARNING)) {
            computedWaterStatus = STATUS_WARNING;
        }
    } else {
        computedWaterStatus = STATUS_DANGER; // Fallback if no sensors are working
    }
    data.waterStatus = computedWaterStatus;

    // 4. Construct combined warnings for waterReason (e.g. "High TDS/Low pH & Temp")
    String reasons[4];
    int reasonCount = 0;
    if (data.phWorking && phStatus != STATUS_SAFE) {
        reasons[reasonCount++] = (data.pH < PH_MIN_SAFE) ? "Low pH" : "High pH";
    }
    if (data.tdsWorking && tdsStatus != STATUS_SAFE) {
        reasons[reasonCount++] = "High TDS";
    }
    if (data.tempWorking && tempStatus != STATUS_SAFE) {
        reasons[reasonCount++] = "High Temp";
    }
    if (data.turbidityWorking && turbidityStatus != STATUS_SAFE) {
        reasons[reasonCount++] = "High Turb";
    }

    String combinedReason = "";
    if (reasonCount == 0) {
        combinedReason = "Normal";
    } else if (reasonCount == 1) {
        combinedReason = reasons[0];
    } else if (reasonCount == 2) {
        combinedReason = reasons[0] + " & " + reasons[1];
    } else {
        for (int i = 0; i < reasonCount; i++) {
            if (i > 0) {
                if (i == reasonCount - 1) {
                    combinedReason += " & ";
                } else {
                    combinedReason += "/";
                }
            }
            combinedReason += reasons[i];
        }
    }
    data.waterReason = combinedReason;

    // 5. Determine overall system status (preserves STATUS_ERROR for hardware alarms)
    if (!data.phWorking || !data.tdsWorking || !data.tempWorking || !data.turbidityWorking) {
        data.overallStatus = STATUS_ERROR;
        data.reason = "Sensor Fault";
        data.waterReason = "Sensor Fault";
    } else {
        data.overallStatus = data.waterStatus;
        if (data.overallStatus == STATUS_SAFE) {
            data.reason = "Water is Safe";
        } else {
            data.reason = data.waterReason;
        }
    }
}

float WaterQuality::evaluatePH(float pH, bool working, String &reason, Status &paramStatus) {
    if (!working) {
        paramStatus = STATUS_ERROR;
        reason = "pH Sensor Failed";
        return 0.0;
    }

    if (pH >= PH_MIN_SAFE && pH <= PH_MAX_SAFE) {
        paramStatus = STATUS_SAFE;
        reason = "pH Normal";
        return 100.0;
    } 
    else if (pH >= PH_MIN_WARN && pH < PH_MIN_SAFE) {
        paramStatus = STATUS_WARNING;
        reason = "Low pH (Acidic)";
        return Utilities::mapFloat(pH, PH_MIN_WARN, PH_MIN_SAFE, 50.0, 100.0);
    } 
    else if (pH > PH_MAX_SAFE && pH <= PH_MAX_WARN) {
        paramStatus = STATUS_WARNING;
        reason = "High pH (Alkaline)";
        return Utilities::mapFloat(pH, PH_MAX_SAFE, PH_MAX_WARN, 100.0, 50.0);
    } 
    else if (pH < PH_MIN_WARN) {
        paramStatus = STATUS_DANGER;
        reason = "Critical Acidic pH!";
        return Utilities::mapFloat(pH, 0.0, PH_MIN_WARN, 0.0, 50.0);
    } 
    else { // pH > PH_MAX_WARN
        paramStatus = STATUS_DANGER;
        reason = "Critical Alkaline pH!";
        return Utilities::mapFloat(pH, PH_MAX_WARN, 14.0, 50.0, 0.0);
    }
}

float WaterQuality::evaluateTDS(int tds, bool working, float &compensationTemp, String &reason, Status &paramStatus) {
    if (!working) {
        paramStatus = STATUS_ERROR;
        reason = "TDS Sensor Failed";
        return 0.0;
    }

    if (tds <= TDS_SAFE_LIMIT) {
        paramStatus = STATUS_SAFE;
        reason = "TDS Normal";
        return 100.0;
    } 
    else if (tds > TDS_SAFE_LIMIT && tds <= TDS_WARN_LIMIT) {
        paramStatus = STATUS_WARNING;
        reason = "High TDS (Hard water)";
        return Utilities::mapFloat((float)tds, (float)TDS_SAFE_LIMIT, (float)TDS_WARN_LIMIT, 100.0, 50.0);
    } 
    else { // tds > TDS_WARN_LIMIT
        paramStatus = STATUS_DANGER;
        reason = "Critical High TDS!";
        float score = Utilities::mapFloat((float)tds, (float)TDS_WARN_LIMIT, 1000.0, 50.0, 0.0);
        return Utilities::constrainFloat(score, 0.0, 50.0);
    }
}

float WaterQuality::evaluateTemp(float temp, bool working, String &reason, Status &paramStatus) {
    if (!working) {
        paramStatus = STATUS_ERROR;
        reason = "Temp Sensor Failed";
        return 0.0;
    }

    if (temp <= TEMP_SAFE_LIMIT) {
        paramStatus = STATUS_SAFE;
        reason = "Temperature Normal";
        return 100.0;
    } 
    else if (temp > TEMP_SAFE_LIMIT && temp <= TEMP_WARN_LIMIT) {
        paramStatus = STATUS_WARNING;
        reason = "Elevated Temperature";
        return Utilities::mapFloat(temp, TEMP_SAFE_LIMIT, TEMP_WARN_LIMIT, 100.0, 50.0);
    } 
    else { // temp > TEMP_WARN_LIMIT
        paramStatus = STATUS_DANGER;
        reason = "Critical High Temp!";
        float score = Utilities::mapFloat(temp, TEMP_WARN_LIMIT, 60.0, 50.0, 0.0);
        return Utilities::constrainFloat(score, 0.0, 50.0);
    }
}

float WaterQuality::evaluateTurbidity(int turbidity, bool working, String &reason, Status &paramStatus) {
    if (!working) {
        paramStatus = STATUS_ERROR;
        reason = "Turbidity Sensor Failed";
        return 0.0;
    }

    if (turbidity <= TURBIDITY_SAFE_LIMIT) {
        paramStatus = STATUS_SAFE;
        reason = "Clarity Normal";
        return 100.0;
    } 
    else if (turbidity > TURBIDITY_SAFE_LIMIT && turbidity <= TURBIDITY_WARN_LIMIT) {
        paramStatus = STATUS_WARNING;
        reason = "Cloudy Water";
        return Utilities::mapFloat((float)turbidity, (float)TURBIDITY_SAFE_LIMIT, (float)TURBIDITY_WARN_LIMIT, 100.0, 50.0);
    } 
    else { // turbidity > TURBIDITY_WARN_LIMIT
        paramStatus = STATUS_DANGER;
        reason = "Critical Turbidity!";
        float score = Utilities::mapFloat((float)turbidity, (float)TURBIDITY_WARN_LIMIT, 100.0, 50.0, 0.0);
        return Utilities::constrainFloat(score, 0.0, 50.0);
    }
}
