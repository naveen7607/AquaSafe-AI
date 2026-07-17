#include <Arduino.h>
#include "DataManager.h"

DataManager dataManager;

void setup() {
    dataManager.begin();
}

void loop() {
    dataManager.update();
}
