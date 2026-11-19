import dns from 'dns';
import dotenv from 'dotenv';

try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  // ignore if unsupported in runtime
}

dotenv.config();

