```mermaid
flowchart LR

    %% ESP32
    subgraph ESP32 Microcontroller
        ESP_HTTP["HTTP GET / POST<br/>- Sends percent<br/>- Receives empty weight<br/>- Receives full weight"]

        ESP_WEIGHT["Weight Sensor Readings<br/>- Output percent full<br/>- Detect not placed (weight < empty)"]

        ESP_MAIN["Wakeup System main file<br/>- Attempt send/receive every second<br/>- Notify when near empty"]

        ESP_CALIBRATE["Weight Calibration<br/>- Measure empty and full values"]

        ESP_INIT["Initial WiFi Setup<br/>- Bluetooth provisioning<br/>- OR temporary ESP WiFi AP"]

        ESP_NEARBY["MAYBE: Bluetooth Presence Detection<br/>- Detect nearby people"]
    end

    %% Cloud Server
    subgraph SERVER["Cloud Server"]
        SERVER_HTTP["Backend HTTP Server"]
    end

    %% Web App
    subgraph WEBAPP["Web App"]
        WEB_DISPLAY["Display Percent"]

        WEB_INIT["Give ESP WiFi Credentials"]

        WEB_CALIBRATE["Calibration System<br/>- Send empty and full weights"]

        WEB_GROUP["Group Management<br/>- Join or Leave household"]

        WEB_NOTIF["Notifications<br/>- Send notification based on percent"]
    end

    %% Hardware
    subgraph HW["Hardware"]
        HW_SENSOR["Weight Sensor"]
    end

    %% Connections
    HW_SENSOR --> |"Current Weight"| ESP_WEIGHT

    ESP_MAIN --> |"Alert when almost empty"| WEB_NOTIF
    ESP_WEIGHT --> |"Percent Full"| WEB_DISPLAY
    ESP_WEIGHT --> |"Percent Full"| ESP_MAIN
    ESP_CALIBRATE <--> |"Empty/Full Weights"| WEB_CALIBRATE
 
    WEB_INIT <--> |"WiFi Credentials"| ESP_INIT


    