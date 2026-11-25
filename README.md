# uptime-proxy

A Cloudflare Worker that lets an uptime monitor check services behind Cloudflare Access: it fetches the given URL with an Access service token and returns 200 if the service responded 200, or an error status otherwise.
