//#include "wifi_provisioning.h"
//#include "http_utils.h"
#include <stdio.h>    // printf, sscanf
#include <string.h>   // strstr, strncpy, strcmp, memset
#include <ctype.h>    // isxdigit
#include <stddef.h>   // size_t

/* URL decode (for wifi credentials) */
void url_decode(char *dst, const char *src)
{
    while (*src)
    {
        if (*src == '+')
        {
            *dst++ = ' ';
            src++;
        }
        else if (*src == '%' && isxdigit((unsigned char)src[1]) && isxdigit((unsigned char)src[2]))
        {
            int val;
            sscanf(src + 1, "%2x", &val);
            *dst++ = (char)val;
            src += 3;
        }
        else
        {
            *dst++ = *src++;
        }
    }
    *dst = '\0';
}
void parse_http_credentials_data(const char *data, char *ssid, char *pass)
{
    // Format: ssid=MySSID&pass=MyPassword
    char *p = strstr(data, "&pass=");
    if (p)
    {
        size_t ssid_len = p - (data + 5); // 5 = length of "ssid="
        if (ssid_len >= 64)
            ssid_len = 63; // prevent overflow
        strncpy(ssid, data + 5, ssid_len);
        ssid[ssid_len] = '\0';

        // Everything after "&pass=" is the password
        strncpy(pass, p + 6, 63); // 6 = length of "&pass="
        pass[63] = '\0';
    }
}


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
        {"ssid=Short&pass=BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", 
            "Short", "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"}, // long pass
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


int main(void) {
    
    printf("Running tests...\n\n");

    test_url_decode();
    test_parse_http_credentials_data();

    for (int i=0; i<63;i++)
        printf("B");

    return 0;
}

