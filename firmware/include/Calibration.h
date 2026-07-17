#ifndef CALIBRATION_H
#define CALIBRATION_H

// --- ESP32 ADC Configurations ---
#define ADC_REF_VOLTAGE 3.3        // ESP32 ADC Reference Voltage (V)
#define ADC_RESOLUTION 4095.0      // 12-bit ADC Resolution

// --- pH Sensor Calibration ---
// pH Formula: pH = 7.0 + ((V_pH7 - V_actual) / Slope)
// PH_VOLTAGE_AT_7: measure your sensor's output voltage in pH 7 buffer solution and set here.
// For 3.3V-powered analog pH modules the midpoint is typically ~1.65V (half of VCC).
// PH_SLOPE: voltage change per pH unit. Standard = 0.1778V/pH. Tune with pH 4 & pH 10 buffers.
#define PH_VOLTAGE_AT_7 1.65       // Voltage output at pH 7.0 (calibrate with pH 7 buffer)
#define PH_SLOPE 0.1778            // Voltage change per pH unit (59.16mV/pH at 25°C)

// --- TDS Sensor Calibration ---
#define TDS_CALIBRATION_FACTOR 0.5 // Standard conversion factor (TDS = EC * factor)
#define TEMP_COMP_COEFF 0.02       // 2% per °C temperature compensation coefficient

// --- Turbidity Sensor Calibration ---
// Sensor powered at 5V with a 10k/15k voltage divider (5V -> ~3.0V at ADC pin).
// Scale factor = 15/(10+15) = 0.6
// Clean water: sensor outputs ~4.5V -> ADC sees ~2.7V
// Dirty water: sensor outputs ~2.5V -> ADC sees ~1.5V
#define TURBIDITY_VOLT_CLEAN 2.7   // Volts in pure clear water (after voltage divider)
#define TURBIDITY_VOLT_DIRTY 1.5   // Volts at maximum turbidity (after voltage divider)

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
