#ifndef CALIBRATION_H
#define CALIBRATION_H

// --- ESP32 ADC Configurations ---
#define ADC_REF_VOLTAGE 3.3        // ESP32 ADC Reference Voltage (V)
#define ADC_RESOLUTION 4095.0      // 12-bit ADC Resolution

// --- pH Sensor Calibration ---
// pH Formula: pH = 7.0 + ((V_pH7 - V_actual) / Slope)
#define PH_VOLTAGE_AT_7 2.08       // Voltage output at pH 7.0 (Calibrated to 2.078V in clear mineral water at 3.3V power)
#define PH_SLOPE 0.18              // Voltage change per pH unit (Slope)

// --- TDS Sensor Calibration ---
#define TDS_CALIBRATION_FACTOR 0.5 // Standard conversion factor (TDS = EC * factor)
#define TEMP_COMP_COEFF 0.02       // 2% per °C temperature compensation coefficient

// --- Turbidity Sensor Calibration ---
// When powered at 5V, clear water outputs ~4.1V-4.5V which saturates the ESP32 ADC at 3.3V.
// Thus, 3.25V represents the start of the clean-to-cloudy transition range.
#define TURBIDITY_VOLT_CLEAN 3.25  // Volts in pure clear water (saturated threshold)
#define TURBIDITY_VOLT_DIRTY 1.50  // Volts at maximum turbidity (muddy water): sensor outputs ~2.5V -> ADC sees ~1.5V

// --- Temperature Sensor Offset ---
#define TEMP_CAL_OFFSET 0.0        // ds18b20 temperature offset in degrees C

// --- Water Quality Thresholds ---

// pH limits (Standard drinking water: 6.5 - 8.5)
#define PH_MIN_SAFE 6.5
#define PH_MAX_SAFE 8.5
#define PH_MIN_WARN 5.5
#define PH_MAX_WARN 9.0

// TDS limits (Standard drinking water: < 300 ppm is excellent, > 600 ppm is unacceptable)
#define TDS_SAFE_LIMIT 300
#define TDS_WARN_LIMIT 600

// Temperature limits (Drinking water temperature limits)
#define TEMP_SAFE_LIMIT 30.0
#define TEMP_WARN_LIMIT 40.0

// Turbidity limits (Standard drinking water should be clear, < 5% / 5 NTU)
#define TURBIDITY_SAFE_LIMIT 5     // Turbidity in %
#define TURBIDITY_WARN_LIMIT 15    // Turbidity in %

#endif // CALIBRATION_H
