import { useCallback, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { User } from '../openapi/generated/alzan-be/sdk.gen';

export const useUserSearch = () => {
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [internalQuery, setInternalQuery] = useState('');

  const {
    data: searchResults,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['user-search', debouncedQuery],
    queryFn: () => User.searchUsers({ query: { q: debouncedQuery, limit: 20, offset: 0 } }),
    enabled: debouncedQuery.length > 0,
    staleTime: 1000 * 60, // 1 minute cache
  });

  const handleSearch = useCallback((text: string) => {
    setInternalQuery(text);
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(internalQuery);
    }, 500); // 500ms debounce
    return () => clearTimeout(handler);
  }, [internalQuery]);

  return {
    searchResults: searchResults?.data ?? [],
    isLoading,
    isError,
    error,
    handleSearch,
    refetch,
    searchQuery: internalQuery,
  };
};
