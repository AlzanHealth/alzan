import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import { searchIngredients, calculateMacros, IngredientSearchResult } from '../../services/ingredientsService';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getCurrentAppLocale } from '../../services/localization';

interface IngredientSearchProps {
  onSelect: (ingredient: IngredientSearchResult, amount: number) => void;
  onCancel: () => void;
}

const INGREDIENT_PAGE_SIZE = 10;

export const IngredientSearch: React.FC<IngredientSearchProps> = ({ onSelect, onCancel }) => {
  const { t } = useTranslation();
  const languageCode = getCurrentAppLocale();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<IngredientSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIngredient, setSelectedIngredient] = useState<IngredientSearchResult | null>(null);
  const [amount, setAmount] = useState('100'); // Default 100g
  const [visibleLimit, setVisibleLimit] = useState(INGREDIENT_PAGE_SIZE);
  const [canLoadMore, setCanLoadMore] = useState(false);

  useEffect(() => {
    setVisibleLimit(INGREDIENT_PAGE_SIZE);
  }, [query, languageCode]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (query.length > 2) {
        setLoading(true);
        const res = await searchIngredients(query, languageCode, visibleLimit);
        setResults(res);
        setCanLoadMore(res.length >= visibleLimit);
        setLoading(false);
      } else {
        setResults([]);
        setCanLoadMore(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [query, languageCode, visibleLimit]);

  const handleConfirm = () => {
    if (selectedIngredient && amount) {
      onSelect(selectedIngredient, parseFloat(amount));
    }
  };

  if (selectedIngredient) {
    // Amount Input Mode
    return (
      <BlurView intensity={90} tint="dark" style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>{t('nutrition.howMuchQuestion')}</Text>
          <Text style={styles.subtitle}>{selectedIngredient.name}</Text>

          <View style={styles.amountContainer}>
            <TextInput
              style={styles.amountInput}
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              autoFocus
            />
            <Text style={styles.unitText}>
              {selectedIngredient.unit_basis === 'per_100ml' ? t('nutrition.ml') : 'g'}
            </Text>
          </View>

          <View style={styles.macrosPreview}>
            <Text style={styles.macroText}>
              {calculateMacros(selectedIngredient, parseFloat(amount || '0')).energy_kcal}
              {t('nutrition.kcal')}
            </Text>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity onPress={() => setSelectedIngredient(null)} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>{t('common.back')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleConfirm} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{t('nutrition.add')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </BlurView>
    );
  }

  return (
    <BlurView intensity={90} tint="dark" style={styles.container}>
      <View style={styles.searchHeader}>
        <TouchableOpacity onPress={onCancel} style={styles.closeButton}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
        <TextInput
          style={styles.searchInput}
          placeholder={t('nutrition.searchPlaceholder')}
          placeholderTextColor="#999"
          value={query}
          onChangeText={setQuery}
          autoFocus
        />
      </View>

      {loading && results.length === 0 ? (
        <ActivityIndicator size="large" color="#fff" style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.item} onPress={() => setSelectedIngredient(item)}>
              <View>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemDetail}>
                  {item.category} • {item.kcal_100}
                  {t('nutrition.kcalPer100g')}
                </Text>
              </View>
              <Ionicons name="add-circle-outline" size={24} color="#4ADE80" />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            query.length > 2 && !loading ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>{t('nutrition.notFound')}</Text>
                <Text style={styles.emptySubText}>{t('nutrition.tryGenericTerms')}</Text>
              </View>
            ) : null
          }
          ListFooterComponent={
            canLoadMore ? (
              <TouchableOpacity
                style={styles.loadMoreButton}
                onPress={() => setVisibleLimit(previous => previous + INGREDIENT_PAGE_SIZE)}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#4ADE80" />
                ) : (
                  <Text style={styles.loadMoreText}>{t('common.loadMore')}</Text>
                )}
              </TouchableOpacity>
            ) : null
          }
        />
      )}
    </BlurView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  closeButton: {
    marginRight: 15,
  },
  searchInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 12,
    color: '#fff',
    fontSize: 16,
  },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  itemName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  itemDetail: {
    color: '#aaa',
    fontSize: 12,
    marginTop: 4,
    textTransform: 'capitalize',
  },
  title: {
    fontSize: 24,
    color: '#fff',
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: '#ccc',
    marginBottom: 30,
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 20,
  },
  amountInput: {
    fontSize: 48,
    color: '#4ADE80',
    fontWeight: 'bold',
    width: 120,
    textAlign: 'center',
  },
  unitText: {
    fontSize: 20,
    color: '#4ADE80',
    marginLeft: 8,
  },
  macrosPreview: {
    marginBottom: 40,
  },
  macroText: {
    color: '#fff',
    fontSize: 16,
  },
  actions: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  primaryButton: {
    backgroundColor: '#4ADE80',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 25,
  },
  primaryButtonText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 16,
  },
  secondaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 30,
  },
  secondaryButtonText: {
    color: '#fff',
    fontSize: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 40,
  },
  emptyText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptySubText: {
    color: '#aaa',
    marginTop: 8,
  },
  loadMoreButton: {
    marginTop: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 10,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadMoreText: {
    color: '#4ADE80',
    fontWeight: '600',
  },
});
