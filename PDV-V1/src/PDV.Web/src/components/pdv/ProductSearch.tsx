import { Autocomplete, Box, Stack, Typography } from '@mui/material';
import { useDeferredValue, useEffect, useState } from 'react';
import { ListFilterField } from '../common/ListFilterField';
import { ProductThumbnail } from './ProductThumbnail';
import { productService } from '../../services/productService';
import type { Produto } from '../../types';
import type { Ref } from 'react';

interface ProductSearchProps {
  onSelect: (produto: Produto) => void;
  label?: string;
  placeholder?: string;
  helperText?: string;
  loadingHelperText?: string;
  inputRef?: Ref<HTMLInputElement>;
}

export function ProductSearch({
  onSelect,
  label = 'Buscar produto por nome ou codigo',
  placeholder = 'Digite para localizar itens rapidamente',
  helperText = 'Selecione um item para adicionar ao carrinho.',
  loadingHelperText = 'Buscando produtos...',
  inputRef
}: ProductSearchProps) {
  const [value, setValue] = useState<Produto | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [options, setOptions] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(false);
  const deferredSearch = useDeferredValue(inputValue);

  useEffect(() => {
    let active = true;

    async function loadProducts() {
      setLoading(true);
      try {
        const result = await productService.search(deferredSearch);
        if (active) {
          setOptions(result);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadProducts();
    return () => {
      active = false;
    };
  }, [deferredSearch]);

  return (
    <Autocomplete
      fullWidth
      options={options}
      value={value}
      inputValue={inputValue}
      onInputChange={(_, nextValue) => setInputValue(nextValue)}
      onChange={(_, produto) => {
        setValue(null);
        setInputValue('');
        if (produto) {
          onSelect(produto);
        }
      }}
      getOptionLabel={(option) => `${option.nome}${option.codigoBarras ? ` · ${option.codigoBarras}` : ''}`}
      renderOption={(props, option) => (
        <Box component="li" {...props} sx={{ py: 1.25 }}>
          <Stack direction="row" spacing={1.25} alignItems="center">
            <ProductThumbnail imageUrl={option.imagemUrl} name={option.nome} size={54} />
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700 }}>{option.nome}</Typography>
              <Typography variant="body2" color="text.secondary">
                {option.codigoBarras ?? 'Sem codigo'} · Estoque {option.estoqueAtual} · R$ {option.precoVenda.toFixed(2)}
              </Typography>
              {option.clienteFornecedorNome ? (
                <Typography variant="caption" color="text.secondary">
                  Vinculo automatico: {option.clienteFornecedorNome}
                </Typography>
              ) : null}
            </Box>
          </Stack>
        </Box>
      )}
      renderInput={(params) => (
        <ListFilterField
          {...params}
          label={label}
          placeholder={placeholder}
          loading={loading}
          inputRef={inputRef}
          helperText={loading ? loadingHelperText : helperText}
        />
      )}
    />
  );
}
