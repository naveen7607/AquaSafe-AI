#ifndef FIREBASE_MANAGER_H
#define FIREBASE_MANAGER_H

#include "Types.h"

class FirebaseManager {
public:
    static void begin();
    static bool sync(const SensorData &data);
};

#endif // FIREBASE_MANAGER_H
