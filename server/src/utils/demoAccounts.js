export function isDemoAccount(user) {
  return user?.email?.toLowerCase().endsWith('@demo.chatterbox.test') === true;
}
