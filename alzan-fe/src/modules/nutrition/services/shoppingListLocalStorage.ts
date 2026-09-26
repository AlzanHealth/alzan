import AsyncStorage from '@react-native-async-storage/async-storage';
import { createShoppingListLocalStorage } from './shoppingListLocalStorageCore';

export const shoppingListLocalStorage = createShoppingListLocalStorage((key, value) =>
  AsyncStorage.setItem(key, value),
);
