import { generateVAPIDKeys } from 'web-push';
const keys = generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\nVAPID_SUBJECT=mailto:your-contact@example.com`);
console.log('Store these in private .env. Replace the contact address. Keep the private key secret.');
