#ifndef UTILITIES_H
#define UTILITIES_H

#include <Arduino.h>

class Utilities {
public:
    // Map floating point values linearly from one range to another
    static float mapFloat(float x, float in_min, float in_max, float out_min, float out_max) {
        if (in_max == in_min) return out_min;
        float value = (x - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
        return value;
    }

    // Constrain a float to be within min and max bounds
    static float constrainFloat(float val, float min_val, float max_val) {
        if (val < min_val) return min_val;
        if (val > max_val) return max_val;
        return val;
    }

    // Read and average multiple analog readings to filter out electrical noise
    static int averageAnalogRead(int pin, int samples = 20, int delay_ms = 5) {
        long sum = 0;
        for (int i = 0; i < samples; i++) {
            sum += analogRead(pin);
            delay(delay_ms);
        }
        return sum / samples;
    }
};

#endif // UTILITIES_H
