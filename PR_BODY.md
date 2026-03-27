## PR Description

### Problem
SSH connections to older servers fail with "Handshake failed: no matching key exchange algorithm" error.

### Solution
Add legacy SSH algorithms to `session_manager.js` to support older SSH servers that only support deprecated key exchange and cipher algorithms.

### Changes
- Added `algorithms` configuration to ssh2 connection
- Supported algorithms include:
  - Key Exchange: diffie-hellman-group1-sha1, diffie-hellman-group14-sha1, diffie-hellman-group-exchange-sha1
  - Ciphers: 3des-cbc, aes128-cbc, aes192-cbc, aes256-cbc
  - Server Host Keys: ssh-dss
  - HMAC: hmac-sha1, hmac-sha1-96

### Testing
- Successfully connected to 192.168.17.35 after this change
- Verified `cat /etc/rc.d/tc` command executed successfully

---

✌Bazinga！
