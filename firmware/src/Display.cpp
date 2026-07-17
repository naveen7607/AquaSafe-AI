#include "Display.h"
#include "Config.h"
#include "Version.h"
#include <Wire.h>

Display::Display() 
    : lcd(LCD_I2C_ADDR, LCD_COLS, LCD_ROWS), 
      lastScreenSwitchTime(0), currentScreen(0) {
}

void Display::begin() {
    // Explicitly initialize standard I2C pins
    Wire.begin(LCD_SDA, LCD_SCL);
    
    // Diagnostic I2C scanner to check address and wiring
    Serial.println("\n--- [I2C BUS SCANNER] ---");
    byte count = 0;
    for (byte address = 1; address < 127; address++) {
        Wire.beginTransmission(address);
        if (Wire.endTransmission() == 0) {
            Serial.printf("Discovered I2C Device at Address: 0x%02X\n", address);
            count++;
        }
    }
    if (count == 0) {
        Serial.println("Warning: No I2C devices detected! Please check VCC, GND, SDA, and SCL wiring.");
    } else {
        Serial.println("I2C scan complete.");
    }
    Serial.println("-------------------------\n");
    
    lcd.init();
    lcd.backlight();
    
    // Welcome splash screen
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("AquaSafeAI");
    lcd.setCursor(0, 1);
    lcd.print("Initializing....");
    delay(2000);
}

void Display::update(const SensorData &data) {
    // Check if there is any sensor fault
    bool hasFault = !data.phWorking || !data.tdsWorking || !data.tempWorking || !data.turbidityWorking;
    
    int numScreens = hasFault ? 3 : 2; // 3 screens if there is a fault, 2 screens if not
    
    unsigned long switchInterval = 3000;
    // Screen 3 is now shown first (currentScreen == 0)
    bool isReasonScreen = (currentScreen == 0);
    if (isReasonScreen) {
        switchInterval = 8000; // Increase to 8 seconds to allow reading the scrolling reason
    }
    
    // Switch screens based on dynamic interval
    if (millis() - lastScreenSwitchTime > switchInterval) {
        currentScreen = (currentScreen + 1) % numScreens;
        lcd.clear();
        lastScreenSwitchTime = millis();
    }

    if (currentScreen == 0) {
        showScreen3(data); // Status/Reason screen is shown first
    } else if (currentScreen == 1) {
        showScreen1(data); // Sensor values screen is shown second
    } else {
        showScreen2(data); // Sensor faults screen is shown third (only if hasFault is true)
    }
}

void Display::showScreen1(const SensorData &data) {
    // Upper row: pH and Turbidity
    String left1 = "pH: " + (data.phWorking ? String(data.pH, 1) : "NW");
    String right1 = "Turb:" + (data.turbidityWorking ? String(data.turbidity) + "%" : "NW");
    String line1 = left1;
    while (line1.length() + right1.length() < 16) {
        line1 += " ";
    }
    line1 += right1;
    if (line1.length() > 16) {
        // Fallback: remove space in "pH: "
        line1 = "pH:" + (data.phWorking ? String(data.pH, 1) : "NW");
        while (line1.length() + right1.length() < 16) {
            line1 += " ";
        }
        line1 += right1;
    }
    printLcdLine(0, line1, false);

    // Lower row: TDS and Temp
    String left2 = "TDS: " + (data.tdsWorking ? String(data.tds) : "NW");
    String right2 = "Temp:" + (data.tempWorking ? String((int)data.temperature) : "NW");
    String line2 = left2;
    while (line2.length() + right2.length() < 16) {
        line2 += " ";
    }
    line2 += right2;
    if (line2.length() > 16) {
        // Fallback: remove space in "TDS: "
        line2 = "TDS:" + (data.tdsWorking ? String(data.tds) : "NW");
        while (line2.length() + right2.length() < 16) {
            line2 += " ";
        }
        line2 += right2;
    }
    printLcdLine(1, line2, false);
}

void Display::showScreen2(const SensorData &data) {
    printLcdLine(0, "Sensor Fault:", false);
    
    String failedList = "";
    if (!data.phWorking) failedList += "pH ";
    if (!data.tdsWorking) failedList += "TDS ";
    if (!data.tempWorking) failedList += "Temp ";
    if (!data.turbidityWorking) failedList += "Turb ";
    
    failedList.trim();
    failedList.replace(" ", ",");
    
    printLcdLine(1, failedList, true);
}

void Display::showScreen3(const SensorData &data) {
    bool hasFault = !data.phWorking || !data.tdsWorking || !data.tempWorking || !data.turbidityWorking;
    
    if (hasFault) {
        printLcdLine(0, "Status: Fault", false);
        printLcdLine(1, "Reason: Sensor Fault", true);
    } else {
        String statusStr = "Status: ";
        switch (data.waterStatus) {
            case STATUS_SAFE:
                statusStr += "Safe";
                break;
            case STATUS_WARNING:
                statusStr += "Warning";
                break;
            case STATUS_DANGER:
                statusStr += "Danger";
                break;
            default:
                statusStr += "Unknown";
                break;
        }
        printLcdLine(0, statusStr, false);

        String reasonStr = "Reason: " + data.waterReason;
        printLcdLine(1, reasonStr, true);
    }
}

void Display::printLcdLine(int row, const String &text, bool scroll) {
    lcd.setCursor(0, row);
    if (text.length() <= 16) {
        lcd.print(text);
        for (int i = text.length(); i < 16; i++) {
            lcd.print(" ");
        }
    } else if (scroll) {
        // Smooth scrolling for longer text starting from the beginning when this screen became active
        unsigned long timeActive = millis() - lastScreenSwitchTime;
        String paddedText = text + "    ";
        int len = paddedText.length();
        int offset = (timeActive / 350) % len;
        String scrolled = paddedText.substring(offset) + paddedText.substring(0, offset);
        lcd.print(scrolled.substring(0, 16));
    } else {
        lcd.print(text.substring(0, 16));
    }
}
