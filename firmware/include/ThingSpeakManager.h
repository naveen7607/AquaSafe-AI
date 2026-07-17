#ifndef THINGSPEAK_MANAGER_H
#define THINGSPEAK_MANAGER_H

#include "Types.h"

class ThingSpeakManager {
public:
    static void begin();
    static bool upload(const SensorData &data);
};

#endif // THINGSPEAK_MANAGER_H
