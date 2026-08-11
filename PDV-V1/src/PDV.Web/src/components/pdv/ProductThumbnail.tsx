import { Box, Typography } from '@mui/material';

interface ProductThumbnailProps {
  imageUrl: string | null | undefined;
  name: string;
  size?: number;
  borderRadius?: number;
  padding?: number;
}

export function ProductThumbnail({
  imageUrl,
  name,
  size = 52,
  borderRadius = 2.5,
  padding = 0.5
}: ProductThumbnailProps) {
  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius,
        overflow: 'hidden',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'rgba(23, 75, 138, 0.08)',
        border: '1px solid rgba(23, 75, 138, 0.12)'
      }}
    >
      {imageUrl ? (
        <Box
          component="img"
          src={imageUrl}
          alt={name}
          sx={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            bgcolor: '#fff',
            p: padding
          }}
        />
      ) : (
        <Typography
          variant="caption"
          sx={{
            px: 0.75,
            textAlign: 'center',
            fontWeight: 900,
            color: 'primary.main',
            lineHeight: 1.1
          }}
        >
          {buildProductInitials(name)}
        </Typography>
      )}
    </Box>
  );
}

function buildProductInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return 'PD';
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase();
}
