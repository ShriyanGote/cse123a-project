#include "wifi_provisioning.h"
#include "http_utils.h"

//test url_decode:
//    void url_decode(char *dst, const char *src);
void test_url_decode() {
    struct {
        const char *input;
        const char *expected;
    } tests[] = {
        {"Hello+World", "Hello World"},                  // + → space
        {"ssid=MySSID&pass=1234", "ssid=MySSID&pass=1234"}, // normal text
        {"name=O%27Connor", "name=O'Connor"},           // apostrophe encoded as %27
        {"percent=%25", "percent=%"},                   // %25 → %
        {"mixed+%21+chars", "mixed ! chars"},          // mixed + and % encoding
        {"incomplete%", "incomplete%"},                // lone %, should copy as-is
        {"incomplete%2", "incomplete%2"},              // incomplete hex, copy as-is
        {"empty+", "empty "},                           // + at end
        {"spaces+and+%2Bplus", "spaces and +plus"},    // + and %2B
        {"unicode=%E2%9C%93", "unicode=\xE2\x9C\x93"}, // UTF-8 checkmark
    };

    char decoded[128];

    for (int i = 0; i < sizeof(tests)/sizeof(tests[0]); i++) {
        url_decode(decoded, tests[i].input);
        if (strcmp(decoded, tests[i].expected) != 0) {
            printf("Test %d FAILED!\nInput: '%s'\nExpected: '%s'\nGot: '%s'\n\n",
                   i, tests[i].input, tests[i].expected, decoded);
        } else {
            printf("Test %d passed.\n", i);
        }
    }

    printf("All url_decode tests completed.\n");
}

//test parse_http_credentials_data:
//    void parse_http_credentials_data(const char *data, char *ssid, char *pass);
void test_parse_http_credentials_data() {
    struct {
        const char *input;
        const char *expected_ssid;
        const char *expected_pass;
    } tests[] = {
        {"ssid=MyWiFi&pass=1234", "MyWiFi", "1234"},           // normal
        {"ssid=O%27Connor&pass=p@ssword", "O%27Connor", "p@ssword"}, // apostrophe + special char
        {"ssid=OnlySSID&pass=", "OnlySSID", ""},               // empty password
        {"ssid=&pass=OnlyPass", "", "OnlyPass"},               // empty SSID
        {"ssid=NoPassHere", "", ""},                           // missing &pass=
        {"ssid=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&pass=BBBB", 
            "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "BBBB"}, // long SSID
        {"ssid=Short&pass=BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", 
            "Short", "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"}, // long pass
    };

    char ssid[64];
    char pass[64];

    for (int i = 0; i < sizeof(tests)/sizeof(tests[0]); i++) {
        // Clear buffers
        memset(ssid, 0, sizeof(ssid));
        memset(pass, 0, sizeof(pass));

        parse_http_credentials_data(tests[i].input, ssid, pass);

        if (strcmp(ssid, tests[i].expected_ssid) != 0 || strcmp(pass, tests[i].expected_pass) != 0) {
            printf("Test %d FAILED!\nInput: '%s'\nExpected SSID: '%s', PASS: '%s'\nGot SSID: '%s', PASS: '%s'\n\n",
                   i, tests[i].input, tests[i].expected_ssid, tests[i].expected_pass, ssid, pass);
        } else {
            printf("Test %d passed.\n", i);
        }
    }

    printf("All parse_http_credentials_data tests completed.\n");
}


void main(void) {
    
    test_url_decode();
    test_parse_http_credentials_data();

}

