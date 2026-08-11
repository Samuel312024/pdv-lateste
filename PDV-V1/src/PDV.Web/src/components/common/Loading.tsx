import { Box, CircularProgress, Typography } from '@mui/material';

export function Loading({ message = 'Carregando...' }: { message?: string }) {
  return (
    <Box sx={{ display: 'grid', minHeight: 240, placeItems: 'center', textAlign: 'center' }}>
      <Box>
        <CircularProgress />
        <Typography color="text.secondary" sx={{ mt: 2 }}>
          {message}
        </Typography>
      </Box>
    </Box>
  );
}
