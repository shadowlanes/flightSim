export interface Upgrades {
  fuelEfficiency: number; // 0 to 5
  maxHealth: number;      // 0 to 5
  skin: string;           // Hex color string
}

export interface UserData {
  username: string;
  totalPoints: number;
  upgrades: Upgrades;
}

const STORAGE_KEY = 'flight_sim_users';
const CURRENT_USER_KEY = 'flight_sim_current_user';

export const PersistenceService = {
  getUsers: (): Record<string, UserData> => {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  },

  saveUser: (user: UserData) => {
    const users = PersistenceService.getUsers();
    users[user.username] = user;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
  },

  getCurrentUser: (): UserData | null => {
    const username = localStorage.getItem(CURRENT_USER_KEY);
    if (!username) return null;
    const users = PersistenceService.getUsers();
    return users[username] || null;
  },

  setCurrentUser: (username: string | null) => {
    if (username) {
      localStorage.setItem(CURRENT_USER_KEY, username);
    } else {
      localStorage.removeItem(CURRENT_USER_KEY);
    }
  },

  login: (username: string): UserData => {
    const users = PersistenceService.getUsers();
    if (users[username]) {
      PersistenceService.setCurrentUser(username);
      return users[username];
    } else {
      // Create new user if not exists
      const newUser: UserData = {
        username,
        totalPoints: 0,
        upgrades: {
          fuelEfficiency: 0,
          maxHealth: 0,
          skin: '#888888'
        }
      };
      PersistenceService.saveUser(newUser);
      PersistenceService.setCurrentUser(username);
      return newUser;
    }
  },

  logout: () => {
    PersistenceService.setCurrentUser(null);
  }
};
