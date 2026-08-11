namespace PDV.Api.Infrastructure;

public class ProdutoImagemReconhecimentoOptions
{
    public bool Habilitado { get; set; } = true;
    public string ScriptRelativePath { get; set; } = "Python/product_image_lookup.py";
    public string? PythonExecutable { get; set; }
    public string? PythonArguments { get; set; }
    public string? TesseractExecutablePath { get; set; }
    public string OcrLanguages { get; set; } = "por+eng";
    public int TimeoutSeconds { get; set; } = 20;
}
