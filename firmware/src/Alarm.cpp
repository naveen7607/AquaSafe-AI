#include "Alarm.h"
#include "Config.h"
#include <Arduino.h>

Alarm::Alarm() 
    : lastLedToggleTime(0), lastBuzzerTime(0), 
      ledState(false), buzzerState(false) {
}

void Alarm::begin() {
    pinMode(GREEN_LED, OUTPUT);
    pinMode(YELLOW_LED, OUTPUT);
    pinMode(RED_LED, OUTPUT);
    pinMode(BUZZER_PIN, OUTPUT);
    
    turnOffAll();
}

void Alarm::update(Status status) {
    unsigned long now = millis();
    
    if (status == STATUS_SAFE) {
        digitalWrite(GREEN_LED, HIGH);
        digitalWrite(YELLOW_LED, LOW);
        digitalWrite(RED_LED, LOW);
        if (buzzerState) {
            noTone(BUZZER_PIN);
            digitalWrite(BUZZER_PIN, LOW); // Explicit grounding to ensure silence
            buzzerState = false;
        }
        return;
    }
    
    // Green LED is always off in case of Warning, Danger, or Error
    digitalWrite(GREEN_LED, LOW);
    
    if (status == STATUS_WARNING) {
        // 1. Blink Yellow LED (500ms ON / 500ms OFF)
        if (now - lastLedToggleTime >= 500) {
            ledState = !ledState;
            digitalWrite(YELLOW_LED, ledState ? HIGH : LOW);
            digitalWrite(RED_LED, LOW);
            lastLedToggleTime = now;
        }
        
        // 2. Slow Alert Beep (100ms tone / 1400ms silence)
        unsigned long cyclePeriod = 1500;
        unsigned long phase = (now - lastBuzzerTime) % cyclePeriod;
        if (phase < 100) {
            if (!buzzerState) {
                tone(BUZZER_PIN, 1000); // 1 kHz pitch
                buzzerState = true;
            }
        } else {
            if (buzzerState) {
                noTone(BUZZER_PIN);
                digitalWrite(BUZZER_PIN, LOW);
                buzzerState = false;
            }
        }
    } 
    else if (status == STATUS_DANGER) {
        // 1. Blink Red LED (200ms ON / 200ms OFF)
        if (now - lastLedToggleTime >= 200) {
            ledState = !ledState;
            digitalWrite(RED_LED, ledState ? HIGH : LOW);
            digitalWrite(YELLOW_LED, LOW);
            lastLedToggleTime = now;
        }
        
        // 2. Fast Intermittent Beep (100ms tone / 300ms silence)
        unsigned long cyclePeriod = 400;
        unsigned long phase = (now - lastBuzzerTime) % cyclePeriod;
        if (phase < 100) {
            if (!buzzerState) {
                tone(BUZZER_PIN, 1500); // 1.5 kHz pitch (sharper tone)
                buzzerState = true;
            }
        } else {
            if (buzzerState) {
                noTone(BUZZER_PIN);
                digitalWrite(BUZZER_PIN, LOW);
                buzzerState = false;
            }
        }
    }
    else if (status == STATUS_ERROR) {
        // 1. Flash Red LED extremely fast (100ms ON / 100ms OFF)
        if (now - lastLedToggleTime >= 100) {
            ledState = !ledState;
            digitalWrite(RED_LED, ledState ? HIGH : LOW);
            digitalWrite(YELLOW_LED, LOW);
            lastLedToggleTime = now;
        }
        
        // 2. Continuous Urgent Beep (300ms tone / 300ms silence)
        unsigned long cyclePeriod = 600;
        unsigned long phase = (now - lastBuzzerTime) % cyclePeriod;
        if (phase < 300) {
            if (!buzzerState) {
                tone(BUZZER_PIN, 1800); // 1.8 kHz pitch (loudest alert)
                buzzerState = true;
            }
        } else {
            if (buzzerState) {
                noTone(BUZZER_PIN);
                digitalWrite(BUZZER_PIN, LOW);
                buzzerState = false;
            }
        }
    }
}

void Alarm::turnOffAll() {
    digitalWrite(GREEN_LED, LOW);
    digitalWrite(YELLOW_LED, LOW);
    digitalWrite(RED_LED, LOW);
    noTone(BUZZER_PIN);
    digitalWrite(BUZZER_PIN, LOW);
    buzzerState = false;
}
