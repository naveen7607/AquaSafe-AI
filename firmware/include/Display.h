#ifndef DISPLAY_H
#define DISPLAY_H

#include "Types.h"
#include <LiquidCrystal_I2C.h>

class Display {
public:
    Display();
    void begin();
    void update(const SensorData &data);

private:
    LiquidCrystal_I2C lcd;
    unsigned long lastScreenSwitchTime;
    int currentScreen;
    
    void showScreen1(const SensorData &data);
    void showScreen2(const SensorData &data);
    void showScreen3(const SensorData &data);
    void printLcdLine(int row, const String &text, bool scroll = true);
};

#endif // DISPLAY_H
