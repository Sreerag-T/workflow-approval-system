import { createSlice } from '@reduxjs/toolkit';
import { api } from '../api/apiSlice';

const saved = () => {
  try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
};

const authSlice = createSlice({
  name: 'auth',
  initialState: { token: localStorage.getItem('token'), user: saved() },
  reducers: {
    logout(state) {
      state.token = null;
      state.user = null;
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    },
  },
  extraReducers: (builder) => {
    builder.addMatcher(api.endpoints.login.matchFulfilled, (state, { payload }) => {
      state.token = payload.token;
      state.user = payload.user;
      localStorage.setItem('token', payload.token);
      localStorage.setItem('user', JSON.stringify(payload.user));
    });
  },
});

export const { logout } = authSlice.actions;
export default authSlice.reducer;
