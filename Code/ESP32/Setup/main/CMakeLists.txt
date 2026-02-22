idf_component_register(SRCS "setup_softap_http_main.c"
                    PRIV_REQUIRES esp_wifi nvs_flash esp_netif esp_http_server
                    INCLUDE_DIRS ".")
