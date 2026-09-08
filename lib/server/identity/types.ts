/**
 * Credential ownership, separated from session handling.
 *
 * Sessions stay in the application's own store in both backends: an opaque,
 * hashed, instantly revocable server session is one code path, works
 * identically on SQLite and Firestore, and avoids a token verification round
 * trip on every request. What an identity backend owns is the credential -
 * hashing, verification, rotation and deletion.
 *
 * The application always chooses the account id, so a Firestore user document
 * and its Firebase Authentication record share one identifier.
 */
export interface Credential {
  id: string;
  email: string;
  name: string;
}

export interface Identity {
  readonly name: "local" | "firebase";
  /** Creates the provider-side credential. The caller writes the user record. */
  createUser(input: {
    id: string;
    email: string;
    name: string;
    password: string;
  }): Promise<Credential>;
  /**
   * The value to persist on the user record: a salted scrypt digest locally,
   * an empty string when Firebase Authentication holds the secret.
   */
  secret(password: string): Promise<string>;
  /** Resolves to undefined for both an unknown account and a wrong password. */
  verifyPassword(
    email: string,
    password: string,
  ): Promise<Credential | undefined>;
  setPassword(id: string, password: string): Promise<void>;
  /** Removes the provider-side credential only. */
  deleteUser(id: string): Promise<void>;
  /** Invalidates anything the provider itself issued for this account. */
  revoke(id: string): Promise<void>;
}
