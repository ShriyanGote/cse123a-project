idf_component_register(SRCS "https_testing.c"
                    PRIV_REQUIRES esp_wifi nvs_flash esp_event esp_netif esp_http_client mbedtls
                    INCLUDE_DIRS ".")
