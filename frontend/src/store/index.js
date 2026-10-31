import { configureStore } from '@reduxjs/toolkit';
import { api } from '../api/apiSlice';
import auth, { logout } from './authSlice';

export const store = configureStore({
  reducer: { [api.reducerPath]: api.reducer, auth },
  middleware: (gdm) => gdm().concat(api.middleware),
});

export const resetApiOnLogout = () => {
  store.dispatch(logout());
  store.dispatch(api.util.resetApiState());
};
