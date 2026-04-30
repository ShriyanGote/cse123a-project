idf_component_register(
    SRCS "main.c"
    PRIV_REQUIRES bt nvs_flash esp_wifi esp_netif esp_event esp_http_client json esp-tls mbedtls
    INCLUDE_DIRS ".")
