idf_component_register(
    SRCS "main.c" "wifi_manager.c" "https_client.c"
    INCLUDE_DIRS "."
    PRIV_REQUIRES mbedtls esp_wifi esp_event esp_netif nvs_flash esp_http_client
)