# 123a-project: Smart Pitcher Base


# How to run code

## ESP32c3
The ESP32c3 code is located under [Code/ESP32/HX711](Code/ESP32/HX711).

To run this code:
- download ESP-IDF
- Inside the esp-idf command line, run ./export.sh
- Go to the main folder, Code/ESP32/HX711
- Plug the ESP32C3 into a USB port
- run idf.py set-target esp32c3
- run idf.py build flash monitor

For more help, access the Espressif web page: [here](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/get-started/index.html)