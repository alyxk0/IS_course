export default {
  randomBytes(length) {
    return crypto.getRandomValues(new Uint8Array(length));
  },
};
