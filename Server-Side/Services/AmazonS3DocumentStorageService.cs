using Amazon;
using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Syncfusion.EJ2.DocumentEditor;
using Syncfusion.EJ2.FileManager.AmazonS3DocumentManager;
using Syncfusion.EJ2.FileManager.Base;
using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;

namespace EJ2AmazonS3ASPCoreFileProvider.Services
{
    public class AmazonS3DocumentStorageService : IAmazonS3DocumentStorageService
    {
        private readonly string _accessKey;
        private readonly string _secretKey;
        private readonly string _bucketName;
        private readonly RegionEndpoint _region;
        private readonly IAmazonS3 _s3Client;
        private readonly ILogger<AmazonS3DocumentStorageService> _logger;
        private readonly AmazonS3DocumentManager _fileProvider;
        private readonly string _rootFolderName;
        public string basePath;

        public AmazonS3DocumentStorageService(IAmazonS3 s3Client, IWebHostEnvironment hostingEnvironment,
            IConfiguration configuration,
            ILogger<AmazonS3DocumentStorageService> logger)
        {
            _s3Client = s3Client;
            _logger = logger;
            _accessKey = configuration["AccessKey"];
            _secretKey = configuration["SecretKey"];
            _bucketName = configuration["BucketName"];
            _region = RegionEndpoint.GetBySystemName(configuration["AWS:Region"]); ;
            //Folder name created inside the container
            _rootFolderName = "Files";
            // Initialize basePath from the hosting environment and clean it up
            this.basePath = hostingEnvironment.ContentRootPath;
            this.basePath = this.basePath.Replace("../", "");

            _fileProvider = new AmazonS3DocumentManager();
            _fileProvider.RegisterAmazonS3(_bucketName, _accessKey, _secretKey, _region.SystemName);

            // Register the Amazon S3 storage credentials and bucket name.
            //----------
            // For example:
            // _fileProvider.RegisterAmazonS3("bucketName", "YOUR_ACCESS_KEY", "YOUR_SECRET_KEY", "us-east-1");
            // Note: Ensure that a "rootFolder" is created inside the bucket.
            // Documents inside that folder can be accessed.
            //----------
        }

        /// <summary>
        /// Performs file operations on Amazon S3 based on the specified action.
        /// </summary>
        /// <param name="args">The file manager directory content parameters containing operation details.</param>
        /// <returns>A result object with the operation outcome in camel case format.</returns>
        public object ManageDocument(FileManagerDirectoryContent args)
        {
            try
            {
                // Validate required parameters for operations that modify file structure.
                ValidateFileOperation(args);
                // Use a switch expression to determine the operation to perform.
                return args.Action switch
                {
                    "read" => _fileProvider.ToCamelCase(_fileProvider.GetFiles(args.Path, false, args.Data)),
                    "delete" => ValidateAndDeleteFiles(args),
                    "copy" => _fileProvider.ToCamelCase(_fileProvider.Copy(args.Path, args.TargetPath, args.Names, args.RenameFiles, args.TargetData, args.Data)),
                    "move" => _fileProvider.ToCamelCase(_fileProvider.Move(args.Path, args.TargetPath, args.Names, args.RenameFiles, args.TargetData, args.Data)),
                    "details" => _fileProvider.ToCamelCase(_fileProvider.Details(args.Path, args.Names, args.Data)),
                    "create" => _fileProvider.ToCamelCase(_fileProvider.Create(args.Path, args.Name, args.Data)),
                    "search" => _fileProvider.ToCamelCase(_fileProvider.Search(args.Path, args.SearchString, args.ShowHiddenItems, args.CaseSensitive, args.Data)),
                    "rename" => _fileProvider.ToCamelCase(_fileProvider.Rename(args.Path, args.Name, args.NewName, false, args.ShowFileExtension, args.Data)),
                    _ => throw new ArgumentException("Invalid file operation")
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "File operation failed");
                return GenerateErrorResponse("500", "Operation failed");
            }
        }

        /// <summary>
        /// Handles file download operations from Amazon S3 file manager
        /// </summary>
        /// <param name="args">Download parameters including target paths</param>
        /// <returns>File stream result or error response</returns>
        /// <exception cref="Exception">Thrown for download failures</exception>
        public object DownloadDocument(FileManagerDirectoryContent args)
        {
            try
            {
                return _fileProvider.Download(args.Path, args.Names);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Download failed");
                return new StatusCodeResult(500);
            }
        }

        /// <summary>
        /// Loads a document from Amazon S3 and returns the serialized document.
        /// </summary>
        /// <param name="documentName">The name of the document to load.</param>
        /// <returns>An IActionResult containing the serialized document if successful, or an error status code.</returns>
        public async Task<IActionResult> FetchDocumentAsync(string documentName)
        {
            try
            {
                // Create a new S3 client for this operation.
                using var s3Client = new AmazonS3Client(_accessKey, _secretKey, _region);
                using var stream = new MemoryStream();
                // Get the document object from the S3 bucket.
                var response = await s3Client.GetObjectAsync(_bucketName, $"{_rootFolderName}/{documentName}");
                await response.ResponseStream.CopyToAsync(stream);
                stream.Seek(0, SeekOrigin.Begin);
                // Load the document using Syncfusion's WordDocument loader.
                var document = WordDocument.Load(stream, FormatType.Docx);
                // Serialize the document to JSON format.
                return new OkObjectResult(JsonConvert.SerializeObject(document));
            }
            catch (AmazonS3Exception ex)
            {
                _logger.LogError(ex, "S3 error loading document");
                return new StatusCodeResult(500);
            }
        }

        /// <summary>
        /// Saves a document to Amazon S3 using the provided form file.
        /// </summary>
        /// <param name="file">The uploaded form file to be saved.</param>
        /// <param name="documentName">The name under which the document will be stored in S3.</param>
        /// <returns>An IActionResult indicating whether the save operation was successful.</returns>
        public async Task<IActionResult> UploadDocumentAsync(IFormFile file, string documentName)
        {
            try
            {
                // Create a new S3 client instance for uploading the document.
                using var s3Client = new AmazonS3Client(_accessKey, _secretKey, _region);
                using var stream = new MemoryStream();
                // Copy the uploaded file content to a memory stream.
                await file.CopyToAsync(stream);
                stream.Seek(0, SeekOrigin.Begin);
                // Construct the put object request with the necessary details.
                var request = new PutObjectRequest
                {
                    BucketName = _bucketName,
                    Key = $"{_rootFolderName}/{documentName}",
                    InputStream = stream
                };
                // Upload the file to the S3 bucket.
                await s3Client.PutObjectAsync(request);
                return new OkResult();
            }
            catch (AmazonS3Exception ex)
            {
                _logger.LogError(ex, "S3 error saving document");
                return new StatusCodeResult(500);
            }
        }

        /// <summary>
        /// Checks whether a document exists in Amazon S3 by attempting to retrieve its metadata.
        /// </summary>
        /// <param name="documentName">The name of the document to check.</param>
        /// <returns>A boolean value indicating if the document exists.</returns>
        public async Task<bool> CheckDocumentExistsAsync(string documentName)
        {
            try
            {
                using var s3Client = new AmazonS3Client(_accessKey, _secretKey, _region);
                // Check if the document exists by fetching metadata
                await s3Client.GetObjectMetadataAsync(_bucketName, $"{_rootFolderName}/{documentName}");
                return true; // If metadata exists, file exists
            }
            catch (AmazonS3Exception ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
            {
                return false; // File does not exist
            }
        }

        /// <summary>
        /// Validates file operations to ensure that critical parameters are provided, particularly for delete or rename actions.
        /// Throws an exception if validation fails.
        /// </summary>
        /// <param name="args">The file manager directory content parameters.</param>
        private void ValidateFileOperation(FileManagerDirectoryContent args)
        {
            if ((args.Action == "delete" || args.Action == "rename") &&
                string.IsNullOrEmpty(args.TargetPath) &&
                string.IsNullOrEmpty(args.Path))
            {
                throw new InvalidOperationException("Restricted to modify the root folder.");
            }
        }

        /// <summary>
        /// Validate the provided path and perform the delete operation.
        /// </summary>
        /// <param name="args">The file manager directory content parameters.</param>
        /// <returns>A result object representing the delete operation outcome in camel case format.</returns>
        private object ValidateAndDeleteFiles(FileManagerDirectoryContent args)
        {
            if (string.IsNullOrEmpty(args.Path))
                throw new ArgumentException("Path cannot be empty for delete operation");

            return _fileProvider.ToCamelCase(_fileProvider.Delete(args.Path, args.Names, args.Data));
        }

        /// <summary>
        /// Generate an error response object with a specified error code and message.
        /// </summary>
        /// <param name="code">The error code as a string.</param>
        /// <param name="message">A descriptive error message.</param>
        /// <returns>An anonymous object representing the error response.</returns>
        private object GenerateErrorResponse(string code, string message) => new
        {
            error = new { code, message }
        };
    }
}