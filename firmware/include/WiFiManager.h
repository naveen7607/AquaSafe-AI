#ifndef WIFI_MANAGER_H
#define WIFI_MANAGER_H

class WiFiManager {
public:
    static void begin();
    static bool isConnected();
    static void keepAlive();
};

#endif // WIFI_MANAGER_H
