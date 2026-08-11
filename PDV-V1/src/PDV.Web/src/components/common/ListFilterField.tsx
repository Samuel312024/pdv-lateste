import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { CircularProgress, InputAdornment, TextField, type TextFieldProps } from '@mui/material';

type ListFilterFieldProps = TextFieldProps & {
  loading?: boolean;
};

export function ListFilterField({
  loading = false,
  fullWidth = true,
  InputProps,
  sx,
  ...props
}: ListFilterFieldProps) {
  const nextSx = [
    {
      minWidth: 0,
      '& .MuiOutlinedInput-root': {
        borderRadius: 3,
        bgcolor: '#ffffff'
      }
    },
    ...(Array.isArray(sx) ? sx : [sx])
  ];

  return (
    <TextField
      {...props}
      fullWidth={fullWidth}
      sx={nextSx}
      InputProps={{
        ...InputProps,
        startAdornment: (
          <>
            <InputAdornment position="start">
              <SearchRoundedIcon fontSize="small" />
            </InputAdornment>
            {InputProps?.startAdornment}
          </>
        ),
        endAdornment: (
          <>
            {loading ? <CircularProgress size={18} color="inherit" sx={{ mr: 1 }} /> : null}
            {InputProps?.endAdornment}
          </>
        )
      }}
    />
  );
}
