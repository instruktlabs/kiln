/**
 * Hostnames that name this machine's loopback interface, spelled as `URL.hostname`
 * reports them. The local viewer answers these Host names, and loopback HTTP is the
 * only plain-HTTP download location hosts accept.
 */
export const LOOPBACK_HOSTNAMES: readonly string[] = ['127.0.0.1', 'localhost', '[::1]'];
