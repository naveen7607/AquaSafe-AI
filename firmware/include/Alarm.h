#ifndef ALARM_H
#define ALARM_H

#include "Types.h"

class Alarm {
public:
    Alarm();
    void begin();
    void update(Status status);

private:
    unsigned long lastLedToggleTime;
    unsigned long lastBuzzerTime;
    bool ledState;
    bool buzzerState;
    
    void turnOffAll();
};

#endif // ALARM_H
