export type User = { name: string; email: string; password: string };

const USERS_KEY = "meetingos_users";
const SESSION_KEY = "meetingos_session";

export function getUsers(): User[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(USERS_KEY) ?? "[]"); }
  catch { return []; }
}

export function saveUser(user: User): { ok: boolean; error?: string } {
  const users = getUsers();
  if (users.find(u => u.email.toLowerCase() === user.email.toLowerCase()))
    return { ok: false, error: "An account with this email already exists." };
  users.push(user);
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  return { ok: true };
}

export function loginUser(email: string, password: string): { ok: boolean; user?: User; error?: string } {
  const users = getUsers();
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
  if (!user) return { ok: false, error: "Invalid email or password." };
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  return { ok: true, user };
}

export function getSession(): User | null {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null"); }
  catch { return null; }
}

export function logout() {
  localStorage.removeItem(SESSION_KEY);
}
