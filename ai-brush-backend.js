exports.handler = async (event) => {
    console.log(event)

    /**
     * 
     * Access-Control-Allow-Origin: * |
  allowed domains for CORS access
Access-Control-Allow-Methods: * |
  allowed HTTP methods for CORS
Access-Control-Allow-Headers: * |
  request headers client can send
Access-Control-Expose-Headers: 
  *,x-amzn-remapped-authorization |
  response headers client can read
     */


    return {
        "isBase64Encoded": false,
        statusCode: 200,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Expose-Headers": "*,x-amzn-remapped-authorization"
        },
        body: JSON.stringify({})
    };
};